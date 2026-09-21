import os
import google.generativeai as genai
from pydantic import BaseModel

# Ensure environment variable is safely accessed
api_key = os.environ.get("GEMINI_API_KEY1")
genai.configure(api_key=api_key)


class CapacityNeed(BaseModel):
    topic: str
    supply_percentage: int
    demand_percentage: int
    target_year: int
    risk_level: str


system_instruction = """
You are a predictive workforce intelligence AI.
Identify emerging technologies and skills likely to become important from 2026-2030,
especially for government, statistics, AI, data analytics, and digital governance.

Generate realistic estimated projections for supply and future demand.
Do not invent sources or present predictions as certain.
Return concise dashboard-ready results.
"""

# FIX: Use a valid model name like 'gemini-1.5-flash'
model = genai.GenerativeModel(
    "gemini-3.0-flash",
    "gemini-3.5-flash",
    system_instruction=system_instruction
)


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

    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=list[CapacityNeed]
        )
    )

    return response.text
