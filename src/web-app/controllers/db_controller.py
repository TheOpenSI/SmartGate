import os
import psycopg

DATABASE_URL = os.getenv("DATABASE_URL")

# Connect to the database
def get_db_connection():
    conn = psycopg.connect(DATABASE_URL)
    return conn

# Function to check database connection
def check_db_connection():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1;")
        result = cursor.fetchone()
        if result[0] == 1:
            print("Database connection is successful!")
            return True
    except Exception as e:
        print(f"Database connection failed: {e}")
        return False
    finally:
        cursor.close()
        conn.close()

def insert_user(user: dict):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if the user already exists based on user_id or username
        cursor.execute("""
            SELECT COUNT(*) FROM users WHERE user_id = %s OR username = %s;
        """, (user['id'], user['login']))

        result = cursor.fetchone()

        # If the count is 0, the user doesn't exist, so insert the user
        if result[0] == 0:
            cursor.execute("""
                INSERT INTO users (user_id, username, role_id) 
                VALUES (%s, %s, %s);
            """, (user['id'], user['login'], user['role_id']))

            conn.commit()
            print("User Inserted Successfully!")
        else:
            print("User already exists. Skipping insert.")
    
    except Exception as e:
        print(f"Error inserting user: {e}")
    finally:
        # Close the connection
        cursor.close()
        conn.close()

def check_permission(username: str, perm_name: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT 1 
            FROM user_perms 
            WHERE username = %s 
            AND permissions @> %s::jsonb 
            LIMIT 1;
        """, (username, f'["{perm_name}"]'))

        # Fetch the result
        result = cursor.fetchone()

        # Check if the user has the permission
        return result is not None

    except Exception as e:
        print(f"Error checking permission: {e}")
        return False
    finally:
        # Close the connection
        cursor.close()
        conn.close()

def change_role(username: str, role_name: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Fetch the role_id for the given role_name
        cursor.execute("""
            select role_id from roles where role_name = %s;
        """, (role_name,))
        role_id = cursor.fetchone()

        if not role_id:
            print(f"Error: Role '{role_name}' not found.")
            return

        role_id = role_id[0]  # Get the first column value which is the role_id

        # Update the user's role with the fetched role_id
        cursor.execute("""
            UPDATE users SET role_id = %s WHERE username = %s;
        """, (role_id, username,))

        conn.commit()
        print(f"Role updated successfully for {username}!")

    except Exception as e:
        print(f"Error changing role: {e}")
    finally:
        # Close the connection
        cursor.close()
        conn.close()

def remove_permission(username: str, perm_name: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE user_perms
            SET permissions = permissions - %s
            WHERE username = %s;
        """, (perm_name, username))

        conn.commit()
        print(f"Successfully removed '{perm_name}' from '{username}'.")

    except Exception as e:
        print(f"Error removing permission: {e}")
    finally:
        cursor.close()
        conn.close()

def add_permission(username: str, perm_name: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE user_perms
            SET permissions = permissions || %s::jsonb
            WHERE username = %s;
        """, (f'["{perm_name}"]', username))

        conn.commit()
        print(f"Successfully added '{perm_name}' to '{username}'.")

    except Exception as e:
        print(f"Error adding permission: {e}")
    finally:
        cursor.close()
        conn.close()

def remove_user(username: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM users WHERE username = %s;
        """, (username,))

        conn.commit()
        print(f"Successfully removed '{username}'.")
    except Exception as e:
        print(f"Error removing username: {e}")
    finally:
        cursor.close()
        conn.close()


def mark_user_logged_in(username: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            update user_overview set user_status = 'Logged in' where username = %s;
        """, (username,))
        
        conn.commit()
        print(f"{username} is Logged in!")
    except Exception as e:
        print(f"Error marking user as logged in: {e}")
    finally:
        cursor.close()
        conn.close()

def mark_user_logged_out(username: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            update user_overview set user_status = 'Logged out' where username = %s;
        """, (username,))
        
        conn.commit()
        print(f"{username} is Logged out!")
    except Exception as e:
        print(f"Error marking user as logged out: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def get_user_overview():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            select * from user_overview;
        """)

        return cursor.fetchall()
    except Exception as e:
        print(f"Error fetching user overview: {e}")
    finally:
        cursor.close()
        conn.close()

# Function to clear the users table for all users
def clear_all_users():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            DELETE FROM users;
        """)

        conn.commit()
        print("All users cleared successfully!")
    except Exception as e:
        print(f"Error clearing users: {e}")
    finally:
        cursor.close()
        conn.close()

# check if user is in logged in set
def is_user_logged_in(username: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_status = 'Logged in' FROM user_overview WHERE username = %s;
        """, (username,))
        result = cursor.fetchone()
        return result[0] if result else False
    except Exception as e:
        print(f"Error checking if user is logged in: {e}")
        return False
    finally:
        cursor.close()
        conn.close()

# Get all roles from database
def get_all_roles():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            select role_name from roles;
        """)
        roles = cursor.fetchall()
        return [role[0] for role in roles] 
    except Exception as e:
        print(f"Failed to get all roles from db: {e}!")
    finally:
        cursor.close()
        conn.close()

# Get all alerts from database
def get_all_alerts():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM alerts;")
        return cursor.fetchall()
    except Exception as e:
        print(f"Failed to get all alerts from db: {e}!")
        return []
    finally:
        cursor.close()
        conn.close()

# Add Alerts to DB
def add_alert(alert_desc: str, alert_level: str) -> bool:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO alerts (alert_desc, alert_level)
            VALUES (%s, %s);
        """, (alert_desc, alert_level))
        conn.commit()
        print(f"Alert: {alert_desc} has been added sucessfully as {alert_level}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to add alert: {e}")
        return False
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# Delete alert from db
def delete_alert(alert_no: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM alerts WHERE alert_no = %s;
        """, (alert_no,))
        conn.commit()
        print(f"Alert no: {alert_no} has been deleted!")
    except Exception as e:
        print(f"[ERROR] Failed to delete alert: {e}")
        return False
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def add_gate(gate_no: int, gate_status: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO gates (gate_no, gate_status) 
            VALUES (%s, %s);
        """, (gate_no, gate_status,)) # gate_status is Open or Closed
        conn.commit()

    except Exception as e:
        print(f"[ERROR] Failed to add gate to db: {e}")
        return False
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def update_gate_status(gate_no: int, new_status: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get the current status
        cursor.execute("SELECT gate_status FROM gates WHERE gate_no = %s;", (gate_no,))
        current_status_row = cursor.fetchone()
        if not current_status_row:
            print(f"[ERROR] Gate {gate_no} not found.")
            return

        current_status = current_status_row[0]
        if current_status.lower() == new_status.lower():
            print(f"[INFO] Gate {gate_no} is already {new_status}. No update needed.")
            return

        # Determine which column to increment
        increment_column = "gate_no_opens" if new_status.lower() == "open" else "gate_no_closes"

        # Perform the update
        cursor.execute(f"""
            UPDATE gates
            SET gate_status = %s,
                {increment_column} = {increment_column} + 1
            WHERE gate_no = %s;
        """, (new_status, gate_no))
        
        conn.commit()
        print(f"[INFO] Gate {gate_no} status updated to {new_status}.")
    except Exception as e:
        print(f"[ERROR] Failed to update gate status in db: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
