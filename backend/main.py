from uuid import uuid4
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, UploadFile, File, HTTPException
from pypdf import PdfReader
from io import BytesIO
from pydantic import BaseModel
from fastapi import Request
from .ai_functions import (
    review_cv,
    analyze_job_fit,
    generate_learning_roadmap,
    start_interview,
    interview_chat
)

app = FastAPI()
interview_sessions = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CVRequest(BaseModel):
    cv_text: str
    target_cv_role: str


class JobFitRequest(BaseModel):
    cv_text: str
    job_description: str


class LearningRoadmapRequest(BaseModel):
    target_role: str
    missing_skills: list[str]
    matching_skills: list[str]


class InterviewStartRequest(BaseModel):
    target_role: str
    job_description: str = ""



class InterviewAnswerRequest(BaseModel):
    session_id: str
    user_message: str



@app.get("/")
def home():
    return {"message": "AI Career Coach Backend is running"}

@app.post("/review-cv")
def review_cv_endpoint(request: CVRequest):
    feedback = review_cv(request.cv_text, request.target_cv_role)
    return feedback

@app.post("/job-fit")
def job_fit_endpoint(request: JobFitRequest):
    feedback = analyze_job_fit(request.cv_text, request.job_description)
    return feedback


@app.post("/learning-roadmap")
def learning_roadmap_endpoint(request: LearningRoadmapRequest):
    roadmap = generate_learning_roadmap(request.target_role, request.missing_skills, request.matching_skills)
    return roadmap



@app.post("/interview/start")
def interview_start_endpoint(request: InterviewStartRequest):
    result = start_interview(request.target_role, request.job_description)

    if result is None:
        raise HTTPException(status_code=500, detail="Could not start interview.")

    session_id = str(uuid4())

    interview_sessions[session_id] = {
        "interview_history": result["interview_history"],
        "answer_count": 0
    }

    return {
        "session_id": session_id,
        "question": result["question"],
        "answer_count": 0
    }




@app.post("/interview/answer")
def interview_answer_endpoint(request: InterviewAnswerRequest):
    session = interview_sessions.get(request.session_id)

    if session is None:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    if not request.user_message.strip():
        raise HTTPException(status_code=400, detail="Answer cannot be empty.")

    result = interview_chat(
        request.user_message,
        session["interview_history"],
        session["answer_count"]
    )

    if result is None:
        raise HTTPException(status_code=500, detail="Could not process answer.")

    if result["finished"]:
        del interview_sessions[request.session_id]
        return {
            "finished": True,
            "feedback": result["feedback"]
        }

    session["interview_history"] = result["interview_history"]
    session["answer_count"] = result["answer_count"]
    return {
        "finished": False,
        "question": result["question"],
        "answer_count": result["answer_count"]
    }



@app.post("/upload-cv")
async def upload_cv(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    pdf_bytes = await file.read()

    if len(pdf_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF is too large. Maximum 5 MB.")

    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        cv_text = ""

        for page in reader.pages:
            cv_text += (page.extract_text() or "") + "\n"

        if not cv_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No readable text found in the PDF."
            )

        return {"cv_text": cv_text}

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read PDF.")
