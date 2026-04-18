import json
import pandas as pd
import os
import shutil

BASE_DIR = os.path.dirname(os.path.dirname(__file__))  
INPUT_DIR = os.path.join(BASE_DIR, "input")
PROCESSED_DIR = os.path.join(BASE_DIR, "processed")
OUTPUT_FILE = os.path.join(BASE_DIR, "session_data.xlsx")

os.makedirs(PROCESSED_DIR, exist_ok=True)

def flatten_dict(d, parent_key="", sep="_"):
    items = []

    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k

        # ---- SPECIAL HANDLING: WAVE_CONFIGS ----
        if k == "WAVE_CONFIGS" and isinstance(v, list):
            for i, wave in enumerate(v, start=1):
                wave_prefix = f"{new_key}_wave{i}"

                items.append((f"{wave_prefix}_types", ",".join(wave.get("types", []))))
                items.append((f"{wave_prefix}_weights", ",".join(map(str, wave.get("weights", [])))))
                items.append((f"{wave_prefix}_maxEnemies", wave.get("maxEnemies")))

            continue

        # ---- NORMAL FLATTENING ----
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())

        elif isinstance(v, list):
            items.append((new_key, json.dumps(v))) 

        else:
            items.append((new_key, v))

    return dict(items)

def process_json(file_path):
    with open(file_path, "r") as f:
        data = json.load(f)

    session_id = data["meta"]["generatedAt"]

    # ---- SESSION SUMMARY ----
    meta_flat = flatten_dict(data.get("meta", {}))
    config_flat = flatten_dict(data.get("configSnapshot", {}))
    summary_flat = flatten_dict(data.get("summary", {}))

    session_row = {**meta_flat, **config_flat, **summary_flat}
    session_df = pd.DataFrame([session_row])

    # ---- EVENTS ----
    events_data = []
    for event in data.get("events", []):
        row = {
            "session": session_id,
            "type": event.get("type"),
            "time": event.get("time"),
            "amount": event.get("amount"),
            "hp": event.get("hp"),
            "lives": event.get("lives"),
            "id": event.get("id"),
            "enemyType": event.get("enemyType"),
        }
        events_data.append(row)

    events_df = pd.DataFrame(events_data)

    return session_id, session_df, events_df


def load_existing_data():
    if not os.path.exists(OUTPUT_FILE):
        return pd.DataFrame(), pd.DataFrame()

    try:
        sessions = pd.read_excel(OUTPUT_FILE, sheet_name="Session Summary")
    except:
        sessions = pd.DataFrame()

    try:
        events = pd.read_excel(OUTPUT_FILE, sheet_name="Events")
    except:
        events = pd.DataFrame()

    return sessions, events


def save_to_excel(sessions_df, events_df):
    with pd.ExcelWriter(OUTPUT_FILE, engine="openpyxl") as writer:
        sessions_df.to_excel(writer, sheet_name="Session Summary", index=False)
        events_df.to_excel(writer, sheet_name="Events", index=False)


def main():
    existing_sessions, existing_events = load_existing_data()

    processed_count = 0

    for filename in os.listdir(INPUT_DIR):
        if not filename.endswith(".json"):
            continue

        file_path = os.path.join(INPUT_DIR, filename)

        try:
            session_id, session_df, events_df = process_json(file_path)

            # ---- DUPLICATE CHECK ----
            if not existing_sessions.empty and "generatedAt" in existing_sessions.columns:
                if session_id in existing_sessions["generatedAt"].values:
                    print(f"⚠️ Skipping duplicate session: {filename}")
                    shutil.move(file_path, os.path.join(PROCESSED_DIR, filename))
                    continue

            # AAPPEND
            existing_sessions = pd.concat([existing_sessions, session_df], ignore_index=True)
            existing_events = pd.concat([existing_events, events_df], ignore_index=True)

            # MOVE
            shutil.move(file_path, os.path.join(PROCESSED_DIR, filename))

            processed_count += 1
            print(f"✅ Processed: {filename}")

        except Exception as e:
            print(f"❌ Failed: {filename} | Error: {e}")

    save_to_excel(existing_sessions, existing_events)

    print(f"\n🎉 Done! {processed_count} file(s) processed.")


if __name__ == "__main__":
    main()