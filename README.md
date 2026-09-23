# RAGtales: AI-Powered Book Publishing System

RAGtales is a full-stack, AI-native publishing platform that leverages advanced **Retrieval-Augmented Generation (RAG)** and **Agentic Workflows** to automate the creation, structuring, and editing of long-form book content.

Built as an end-to-end enterprise solution, this project demonstrates scalable AI architectures, rigorous context engineering, and modern full-stack development practices.

## 🚀 Key Features & Capabilities

- **Enterprise RAG Pipelines**: Ingests multi-format documents (PDF, DOCX, TXT) and processes them through an intelligent pipeline involving semantic chunking, metadata extraction, and embedding generation via Ollama (`nomic-embed-text`).
- **Context Engineering & Retrieval**: Uses **ChromaDB** for fast, local-first vector storage. Implements cosine similarity search and context-aware retrieval strategies to ground the AI's responses and reduce hallucination.
- **AI-Native Orchestration**: Orchestrates complex multi-step reasoning workflows using **LangChain** and **FastAPI**, chaining prompts to generate structured book outlines and iteratively draft chapters.
- **Full-Stack Engineering**: A modern **React (Vite)** frontend providing a dynamic conversational interface, paired with a robust **FastAPI** backend tailored for high-performance LLM streaming and state management.
- **Human-in-the-loop Editing**: Features a chat-based querying interface for iterative section-level regeneration, allowing users to safely guide and validate the AI's output.

## 🛠️ Technology Stack

| Domain | Technologies Used |
| :--- | :--- |
| **Backend API** | Python, FastAPI, Uvicorn, SQLAlchemy |
| **Frontend** | React (Vite), JavaScript, CSS |
| **AI Orchestration** | LangChain, Ollama (Llama 3.1) |
| **Data & Storage** | ChromaDB (Vector Store), SQLite |
| **DevOps** | Docker, Docker Compose |

## ⚙️ Architecture Highlights

1. **Ingestion Service**: Handles concurrent uploads, parsing documents via `PyMuPDF` and `python-docx`.
2. **Embedding Pipeline**: Translates text chunks into high-dimensional vectors. Built to be model-agnostic, currently configured for local-first execution via Ollama to optimize cost and privacy.
3. **Generator Node**: A structured-output LLM chain that fuses multiple retrieved contexts to output syntactically valid JSON outlines or markdown chapters.
4. **Originality & Quality Gates**: Plagiarism and semantic-drift detection pipelines ensure generated content remains high-quality and original.

## 🏃‍♂️ Getting Started

### Prerequisites
- Docker & Docker Compose
- Ollama (installed locally with `llama3.1:8b` and `nomic-embed-text` models pulled)

### Quick Start (Docker)
Run the entire stack with a single command:
```bash
docker-compose up --build
```
- **Frontend UI**: `http://localhost:5173`
- **Backend API Docs**: `http://localhost:8000/docs`

### Local Development Setup

#### 1. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

## 🛡️ Future Roadmap

- **Multi-Agent Coordination**: Transitioning the rigid generation pipeline into an autonomous multi-agent system (using LangGraph/CrewAI) featuring specialized `Researcher`, `Writer`, and `Editor` agents.
- **Observability (LLMOps)**: Integration with OpenTelemetry for deep tracing of token usage, latency, and context-retrieval scores.