import os
from pypdf import PdfReader
from google import genai
from dotenv import load_dotenv

load_dotenv()

# Initialize Gemini Client
client = genai.Client(api_key=os.environ.get("API_KEY4"))
EMBED_MODEL = "gemini-embedding-001"


def split_text_recursive(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list[str]:
    """Pure-Python recursive chunker replacing LangChain."""
    if not text:
        return []

    separators = ["\n\n", "\n", ". ", " "]

    def _split(txt: str, sep_idx: int) -> list[str]:
        if len(txt) <= chunk_size or sep_idx >= len(separators):
            return [txt.strip()] if txt.strip() else []

        sep = separators[sep_idx]
        parts = txt.split(sep)
        chunks = []
        current_chunk = ""

        for p in parts:
            candidate = current_chunk + (sep if current_chunk else "") + p
            if len(candidate) <= chunk_size:
                current_chunk = candidate
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                if len(p) > chunk_size:
                    chunks.extend(_split(p, sep_idx + 1))
                    current_chunk = ""
                else:
                    current_chunk = (
                        current_chunk[-chunk_overlap:] + sep + p
                        if chunk_overlap and current_chunk
                        else p
                    )

        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        return chunks

    return _split(text, 0)


def load_and_chunk_pdf(path: str) -> list[str]:
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"

    if not text.strip():
        return []

    return split_text_recursive(text, chunk_size=1000, chunk_overlap=200)


def embed_text(text: list[str]) -> list[list[float]]:
    all_embeddings = []
    for i in range(0, len(text), 50):
        batch = text[i:i + 50]
        response = client.models.embed_content(
            model=EMBED_MODEL,
            contents=batch,
        )
        for item in response.embeddings:
            all_embeddings.append(item.values)
    return all_embeddings
