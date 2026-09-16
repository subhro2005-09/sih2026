import os
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct

load_dotenv()

class QdrantStorage:
    def __init__(self, collection="docs", dim=3072):
        # Read directly from .env variables
        qdrant_url = os.getenv("QDRANT_URL")
        qdrant_api_key = os.getenv("QDRANT_API_KEY", None)

        self.client = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key if qdrant_api_key else None,
            timeout=30
        )
        self.collection = collection

        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            )

    def upsert(self, ids: list, vector: list, payload: list):
        points = [
            PointStruct(id=ids[i], vector=vector[i], payload=payload[i])
            for i in range(len(ids))
        ]
        self.client.upsert(collection_name=self.collection, points=points)

    def search(self, query_vector, top_k: int = 4):
        if not self.client.collection_exists(self.collection):
            return {"context": [], "source": []}

        result = self.client.query_points(
            collection_name=self.collection,
            query=query_vector,
            with_payload=True,
            limit=top_k
        )
        context = []
        sources = set()

        for r in result.points:
            payload = getattr(r, "payload", None) or {}
            txt = payload.get("text", "")
            src = payload.get("source", "")
            if txt:
                context.append(txt)
            if src:
                sources.add(src)

        return {"context": context, "source": list(sources)}