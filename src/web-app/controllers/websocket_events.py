from typing import Callable, Dict, Awaitable, Union
from fastapi import WebSocket
from controllers.main_controller import broadcast_user_overview, websocket_state, fetch_user_data

event_registry: Dict[str, Callable[[WebSocket, dict], Awaitable[Union[dict, None]]]] = {}

def register_event(event_name: str):
    def decorator(func: Callable[[WebSocket, dict], Awaitable[Union[dict, None]]]):
        event_registry[event_name] = func
        return func
    return decorator

@register_event("init")
async def init_event(websocket: WebSocket, data: dict):
    username = data.get("username")
    if username:
        websocket_state[websocket] = {"username": username, "data": None}
    return None

@register_event("user_overview")
async def user_overview_event(websocket: WebSocket, data: dict):
    user_data = fetch_user_data()  # Use the refactored function
    return {"event": "user_overview", "data": user_data}

@register_event("change_role")
async def change_role_event(websocket: WebSocket, data: dict):
    from controllers.db_controller import change_role  # Local import to avoid circular imports
    username = data.get("username")
    new_role = data.get("role")
    if username and new_role:
        change_role(username, new_role)
        await broadcast_user_overview()
    return None

@register_event("alert_data")
async def alert_data_event(websocket: WebSocket, data: dict):
    from controllers.main_controller import fetch_alerts_data  # Local import to avoid circular imports
    alert_data = fetch_alerts_data()
    return {"event": "alert_data", "data": alert_data}
