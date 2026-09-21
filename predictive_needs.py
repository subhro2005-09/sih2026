import os
from google import genai
from pydantic import BaseModel

# Safe lookup for the API key
api_key = (
    os.environ.get("GEMINI_API_KEY1")
)

# Initialize the new Google GenAI Client
client = genai.Client(api_key=api_key)


class CapacityNeed(BaseModel):
    topic: str
    supply_percentage: int
    demand_percentage: int
    target_year: int
    risk_level: str


SYSTEM_INSTRUCTION = """
You are a predictive workforce intelligence AI.
Identify emerging technologies and skills likely to become important from 2026-2030,
especially for government, statistics, AI, data analytics, and digital governance.

Generate realistic estimated projections for supply and future demand.
Do not invent sources or present predictions as certain.
Return concise dashboard-ready results.
"""


def generate_capacity_needs():
    prompt = """
    Generate 4 predictive capacity-building needs for 2026-2030.

    Focus on emerging technologies and skills where future workforce
    demand is expected to exceed current capability.

    Return:
    topic,
    supply_percentage,
    demand_percentage,
    target_year,
    risk_level.
    """

    # Model fallback list using valid model names
    models_to_try = [
        "gemini-3.5-flash",
        "gemini-3.0-flash",
    ]

    response = None
    last_error = None

    for m in models_to_try:
        try:
            response = client.models.generate_content(
                model=m,
                contents=prompt,
                config={
                    "system_instruction": SYSTEM_INSTRUCTION,
                    "response_mime_type": "application/json",
                    "response_schema": list[CapacityNeed],
                    "temperature": 0.2,
                },
            )
            if response and response.parsed:
                break
        except Exception as e:
            last_error = e
            continue

    if not response or not response.parsed:
        raise RuntimeError(f"Failed to generate capacity needs: {last_error}")

    # Returns list of dicts: [{'topic': '...', 'supply_percentage': ...}, ...]
    return [item.model_dump() for item in response.parsed]
