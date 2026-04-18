# hp_timeline.py

import os
import pandas as pd
import matplotlib.pyplot as plt

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
EXCEL_FILE = os.path.join(BASE_DIR, "session_data.xlsx")
OUTPUT_PNG = os.path.join(BASE_DIR, "hp_timeline.png")

SHEET_NAME = "Events"          
TIME_COL = "time"              
HP_COL = "hp"               
SESSION_COL = "session"        
NUM_SESSIONS = 5               


def load_events_data(excel_path):
    """Load the Events sheet from the Excel file."""
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    df = pd.read_excel(excel_path, sheet_name=SHEET_NAME)
    df = df.dropna(subset=[TIME_COL, HP_COL, SESSION_COL])
    return df


def get_latest_sessions(df, n=NUM_SESSIONS):
    """
    Identify the n most recent sessions based on row order.
    Assumes that rows are appended over time, so later row indices = newer data.
    Returns a list of session IDs (strings) in descending recency.
    """
    df_with_index = df.reset_index().rename(columns={"index": "row_num"})

    latest_row = df_with_index.groupby(SESSION_COL)["row_num"].max().reset_index()
    latest_row_sorted = latest_row.sort_values("row_num", ascending=False)

    top_sessions = latest_row_sorted.head(n)[SESSION_COL].tolist()
    return top_sessions


def plot_hp_timeline(df, sessions):
    """
    Create a line plot for each session: time vs hp.
    Saves the figure to OUTPUT_PNG.
    """
    plt.figure(figsize=(10, 6))

    colors = plt.cm.tab10(range(len(sessions)))

    for session, color in zip(sessions, colors):
        session_data = df[df[SESSION_COL] == session].copy()
        session_data = session_data.sort_values(TIME_COL)
        plt.plot(session_data[TIME_COL], session_data[HP_COL],
                 marker='o', linestyle='-', linewidth=1.5,
                 label=f"Session {session}", color=color)

    plt.xlabel("Time")
    plt.ylabel("HP")
    plt.title("HP Over Time – Latest 5 Sessions")
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.6)

    plt.tight_layout()
    plt.savefig(OUTPUT_PNG, dpi=150)
    plt.close()
    print(f"Graph saved to: {OUTPUT_PNG}")


def main():
    try:
        print("Loading events data...")
        df = load_events_data(EXCEL_FILE)

        if df.empty:
            print("No events data found in the Excel file.")
            return

        print("Identifying the 5 most recent sessions...")
        latest_sessions = get_latest_sessions(df, NUM_SESSIONS)
        if not latest_sessions:
            print("No sessions found.")
            return

        print(f"Plotting sessions: {latest_sessions}")
        plot_hp_timeline(df, latest_sessions)

    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    main()