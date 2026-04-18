import pandas as pd
import matplotlib.pyplot as plt
import os

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_FILE = os.path.join(BASE_DIR, "session_data.xlsx")
PLOT_DIR = os.path.join(BASE_DIR, "plots")

os.makedirs(PLOT_DIR, exist_ok=True)


def load_data():
    df = pd.read_excel(DATA_FILE, sheet_name="Session Summary")
    return df


def clean_data(df):
    for col in [
        "ENEMIES_SPAWN_INTERVAL_MIN",
        "ENEMIES_SPAWN_INTERVAL_MAX",
        "bossEntryShipHp",
        "bossEntryShipLives",
    ]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def scatter_plot(df, x_col, y_col, filename, title):
    plt.figure()

    subset = df[[x_col, y_col]].dropna()

    plt.scatter(subset[x_col], subset[y_col], alpha=0.7)

    plt.title(title)
    plt.xlabel(x_col)
    plt.ylabel(y_col)

    plt.grid(True, linestyle="--", alpha=0.3)

    output_path = os.path.join(PLOT_DIR, filename)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()

    print(f"📊 Saved: {output_path}")


def main():
    df = load_data()
    df = clean_data(df)

    # ---- SPAWN MIN ----
    scatter_plot(
        df,
        "ENEMIES_SPAWN_INTERVAL_MIN",
        "bossEntryShipHp",
        "spawn_min_vs_boss_hp.png",
        "Spawn Min vs Boss Entry HP"
    )

    scatter_plot(
        df,
        "ENEMIES_SPAWN_INTERVAL_MIN",
        "bossEntryShipLives",
        "spawn_min_vs_boss_lives.png",
        "Spawn Min vs Boss Entry Lives"
    )

    # ---- SPAWN MAX ----
    scatter_plot(
        df,
        "ENEMIES_SPAWN_INTERVAL_MAX",
        "bossEntryShipHp",
        "spawn_max_vs_boss_hp.png",
        "Spawn Max vs Boss Entry HP"
    )

    scatter_plot(
        df,
        "ENEMIES_SPAWN_INTERVAL_MAX",
        "bossEntryShipIntervalLives".replace("Interval",""),  
        "spawn_max_vs_boss_lives.png",
        "Spawn Max vs Boss Entry Lives"
    )

    print("\n🔥 All plots generated!")


if __name__ == "__main__":
    main()