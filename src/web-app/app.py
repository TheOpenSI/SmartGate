from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from controllers.main_controller import root_router
from starlette.middleware.sessions import SessionMiddleware
from contextlib import asynccontextmanager
import asyncio

@asynccontextmanager
async def lifespan(app):
    try:
        yield
    except asyncio.CancelledError:
        # Prevent ugly traceback on Ctrl+C
        pass

app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory="wwwroot"), name="static")

# Add the SessionMiddleware to your FastAPI app
app.add_middleware(SessionMiddleware, secret_key="your-secret-key")

# This includes the routes from the main_controller
app.include_router(root_router)

if __name__ == "__main__":
    # Running the uvicorn as a webserver
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True, reload_dirs=["wwwroot"])
