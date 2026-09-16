import os
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.environ.get("API_KEY"))
EMBED_MODEL = "gemini-embedding-001"

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

def load_and_chunk_pdf(path: str) -> list[str]:
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"

    if not text.strip():
        return []

    return splitter.split_text(text)

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
