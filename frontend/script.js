
const API = "http://127.0.0.1:8000";

let interviewHistory = [];
let answerCount = 0;
let interviewActive = false;
let jobFitData = null;
let interviewSessionId = null;
// Switch between tabs
function showTab(tabName) {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.hidden = tab.id !== tabName;
    });
}

// Send requests to FastAPI
async function apiRequest(endpoint, data) {
    const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();

    if (result === null) {
        throw new Error("AI returned an empty response.");
    }

    return result;
}

// Safely display plain text
function addText(parent, tag, value) {
    const element = document.createElement(tag);
    element.textContent = String(value ?? "");
    parent.appendChild(element);
    return element;
}

// Display structured AI results
function displayResult(elementId, data) {
    const container = document.getElementById(elementId);
    container.replaceChildren();

    if (!data) {
        addText(container, "p", "No result received.");
        return;
    }

    for (const [key, value] of Object.entries(data)) {
        const section = document.createElement("div");
        section.className = "result-section";

        const title = key.replaceAll("_", " ");
        addText(section, "h3", title);

        if (Array.isArray(value)) {
            if (key === "weeks") {
                value.forEach(week => {
                    const weekSection = document.createElement("div");
                    weekSection.className = "result-section";
                    addText(weekSection, "h3", `Week ${week.week_number}`);

                    for (const [field, content] of Object.entries(week)) {
                        if (field === "week_number") continue;

                        addText(weekSection, "strong", field.replaceAll("_", " "));

                        if (Array.isArray(content)) {
                            const list = document.createElement("ul");
                            content.forEach(item => addText(list, "li", item));
                            weekSection.appendChild(list);
                        } else {
                            addText(weekSection, "p", content);
                        }
                    }

                    section.appendChild(weekSection);
                });
            } else {
                const list = document.createElement("ul");
                value.forEach(item => addText(list, "li", item));
                section.appendChild(list);
            }
        } else {
            addText(section, "p", value);
        }

        container.appendChild(section);
    }
}

// Display error messages
function showError(elementId, error) {
    const container = document.getElementById(elementId);
    container.replaceChildren();
    const message = addText(container, "p", error.message);
    message.className = "error";
}

// Upload PDF and extract text
async function getCVText(textareaId, fileId) {
    const text = document.getElementById(textareaId).value.trim();

    if (text) return text;

    const fileInput = document.getElementById(fileId);
    const file = fileInput?.files?.[0];

    if (!file) {
        throw new Error("Please paste your CV or upload a PDF.");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API}/upload-cv`, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        throw new Error("PDF upload failed.");
    }

    const result = await response.json();
    return result.cv_text;
}

// CV Reviewer
async function reviewCV() {
    const button = document.querySelector("#cv button");
    button.disabled = true;

    try {
        const cvText = await getCVText("cvText", "cvFile");
        const role = document.getElementById("cvRole").value.trim();

        if (!role) throw new Error("Please enter a target job role.");

        displayResult("cvResult", await apiRequest("/review-cv", {
            cv_text: cvText,
            target_cv_role: role
        }));
    } catch (error) {
        showError("cvResult", error);
    } finally {
        button.disabled = false;
    }
}

// Job-Fit Analysis
async function analyzeJobFit() {
    const button = document.querySelector("#job button");
    button.disabled = true;

    try {
        const cvText = document.getElementById("jobCV").value.trim();
        const jobDescription = document.getElementById("jobDescription").value.trim();

        if (!cvText || !jobDescription) {
            throw new Error("Please enter both CV and job description.");
        }

        jobFitData = await apiRequest("/job-fit", {
            cv_text: cvText,
            job_description: jobDescription
        });

        displayResult("jobResult", jobFitData);

        // Automatically transfer skills to Learning Roadmap
        document.getElementById("missingSkills").value =
            jobFitData.missing_skills.join(", ");

        document.getElementById("matchingSkills").value =
            jobFitData.matching_skills.join(", ");
    } catch (error) {
        showError("jobResult", error);
    } finally {
        button.disabled = false;
    }
}

// Learning Roadmap
async function generateRoadmap() {
    const button = document.querySelector("#roadmap button");
    button.disabled = true;

    try {
        const role = document.getElementById("roadmapRole").value.trim();
        const missing = document.getElementById("missingSkills").value
            .split(",").map(skill => skill.trim()).filter(Boolean);
        const matching = document.getElementById("matchingSkills").value
            .split(",").map(skill => skill.trim()).filter(Boolean);

        if (!role || missing.length === 0) {
            throw new Error("Please enter a target role and missing skills.");
        }

        displayResult("roadmapResult", await apiRequest("/learning-roadmap", {
            target_role: role,
            missing_skills: missing,
            matching_skills: matching
        }));
    } catch (error) {
        showError("roadmapResult", error);
    } finally {
        button.disabled = false;
    }
}

// Add a message to the interview chat
function addChatMessage(sender, message) {
    const chat = document.getElementById("interviewChat");
    const element = addText(chat, "div", message);
    element.className = `message ${sender}`;
    chat.scrollTop = chat.scrollHeight;
}

// Start Mock Interview
async function startInterview() {
    document.getElementById("interviewAnswer").disabled = false;
    const role = document.getElementById("interviewRole").value.trim();
    const description = document.getElementById("interviewJob").value.trim();

    if (!role) {
        showError("interviewChat", new Error("Please enter a job role."));
        return;
    }

    const chat = document.getElementById("interviewChat");
    chat.replaceChildren();
    addChatMessage("assistant", "Starting interview...");

    try {
        const result = await apiRequest("/interview/start", {
            target_role: role,
            job_description: description
        });
        interviewSessionId = result.session_id;
        answerCount = result.answer_count;
        interviewActive = true;

        chat.replaceChildren();
        addChatMessage("assistant", result.question);
    } catch (error) {
        interviewActive = false;
        showError("interviewChat", error);
    }
}

// Send interview answer
async function sendAnswer() {
    if (!interviewActive) {
        showError("interviewChat", new Error("Start an interview first."));
        return;
    }

    const answerField = document.getElementById("interviewAnswer");
    const answer = answerField.value.trim();

    if (!answer) return;

    const button = document.querySelectorAll("#interview button")[1];
    button.disabled = true;

    addChatMessage("user", answer);

    try {
        const result = await apiRequest("/interview/answer", {
    session_id: interviewSessionId,
    user_message: answer
    });

        answerCount = result.answer_count;
        answerField.value = "";

        if (result.finished) {
            interviewSessionId = null;
            interviewActive = false;
            addChatMessage("assistant", "Interview complete! Here is your feedback:");

            const feedbackContainer = document.createElement("div");
            feedbackContainer.id = "interviewFeedback";
            document.getElementById("interviewChat").appendChild(feedbackContainer);

            displayResult("interviewFeedback", result.feedback);
            document.getElementById("interviewAnswer").disabled = true;
        } else {
            addChatMessage("assistant", result.question);
        }
    } catch (error) {
        addChatMessage("assistant", `Error: ${error.message}`);
    } finally {
        button.disabled = false;
    }
}

// Show interview tab on page load
showTab("interview");
document.getElementById("cvFile").addEventListener("change", function () {
    const file = this.files[0];
    document.getElementById("fileName").textContent =
        file ? file.name : "No file selected";
});