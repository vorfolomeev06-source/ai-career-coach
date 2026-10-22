
from pydantic import BaseModel, Field


class InterviewFeedback(BaseModel):
    score: int = Field(ge=0, le=100)
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]


class CVFeedback(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    errors: list[str]
    missing_skills: list[str]
    recommendations: list[str]


class JobFitFeedback(BaseModel):
    match_score: int = Field(ge=0, le=100)
    matching_skills: list[str]
    missing_skills: list[str]
    strengths: list[str]
    recommendations: list[str]


class WeekPlan(BaseModel):
    week_number: int
    topics: list[str]
    exercises: list[str]
    goals: str


class LearningRoadmap(BaseModel):
    weeks: list[WeekPlan]
