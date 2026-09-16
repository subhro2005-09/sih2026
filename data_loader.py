import os
from google import genai
from llama_index.readers.file import PDFReader
from llama_index.core.node_parser import SentenceSplitter
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.environ["API_KEY"])
EMBED_MODEL = "gemini-embedding-001"
splitter = SentenceSplitter(chunk_size=1000, chunk_overlap=200)

def load_and_chunk_pdf(path: str) -> list[str]:
    reader = PDFReader()
    docs = reader.load_data(file=path)
    text = [d.text for d in docs if getattr(d, "text", None)]
    chunks = []
    for t in text:
        chunks.extend(splitter.split_text(t))
    return chunks

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