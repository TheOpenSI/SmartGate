# gate-handler.py
from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Gate handler is online!\n"}

if __name__ == "__main__":
    print("Gate Handler! Activated!")
    uvicorn.run(app, host="0.0.0.0", port=3000)
