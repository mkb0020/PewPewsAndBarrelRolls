import pandas as pd
import os

# ---- PATHS ----
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_FILE = os.path.join(BASE_DIR, "session_data.xlsx")
REPORT_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(REPORT_DIR, exist_ok=True)

REPORT_FILE = os.path.join(REPORT_DIR, "balance_report.txt")


def load_data():
    return pd.read_excel(DATA_FILE, sheet_name="Session Summary")


def clean_data(df):
    cols_to_numeric = [
        "bossEntryShipHp",
        "bossEntryShipLives",
        "ENEMIES_SPAWN_INTERVAL_MIN",
        "ENEMIES_SPAWN_INTERVAL_MAX",
        "summary_totalEvents",
        "summary_playerDamageCount",
        "summary_enemyKills",
        "summary_avgTimeToKill",
    ]

    for col in cols_to_numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def compute_correlations(df):
    target_cols = ["bossEntryShipHp", "bossEntryShipLives"]

    numeric_df = df.select_dtypes(include="number")

    correlations = {}

    for target in target_cols:
        if target not in numeric_df.columns:
            continue

        corr = numeric_df.corr(numeric_only=True)[target].sort_values(ascending=False)
        correlations[target] = corr

    return correlations


def format_section(title):
    return f"\n\n=== {title} ===\n"


def generate_report(df, correlations):
    lines = []

    # ---- HEADER ----
    lines.append("WORMHOLE BALANCE ANALYSIS REPORT")
    lines.append("=" * 40)

    # ---- DATASET OVERVIEW ----
    lines.append(format_section("DATASET OVERVIEW"))
    lines.append(f"Total sessions: {len(df)}")

    if "bossEntryShipHp" in df.columns:
        valid_boss = df["bossEntryShipHp"].notna().sum()
        lines.append(f"Boss encounters: {valid_boss}")

    # ---- BASIC STATS ----
    lines.append(format_section("BOSS ENTRY STATS"))

    for col in ["bossEntryShipHp", "bossEntryShipLives"]:
        if col in df.columns:
            lines.append(f"\n{col}:")
            lines.append(f"  Mean: {df[col].mean():.2f}")
            lines.append(f"  Min:  {df[col].min():.2f}")
            lines.append(f"  Max:  {df[col].max():.2f}")

    # ---- CORRELATIONS ----
    lines.append(format_section("KEY CORRELATIONS"))

    for target, corr in correlations.items():
        lines.append(f"\nTop factors influencing {target}:")

        top = corr.dropna().head(10)
        for k, v in top.items():
            if k == target:
                continue
            lines.append(f"  {k}: {v:.3f}")

    # ---- SPICY INSIGHT SECTION ----
    lines.append(format_section("BALANCING INSIGHTS"))

    if "ENEMIES_SPAWN_INTERVAL_MIN" in df.columns and "bossEntryShipHp" in df.columns:
        corr_val = df["ENEMIES_SPAWN_INTERVAL_MIN"].corr(df["bossEntryShipHp"])
        lines.append(f"Spawn MIN vs Boss HP correlation: {corr_val:.3f}")

        if corr_val > 0.2:
            lines.append("→ Higher spawn interval MIN may be making runs easier.")
        elif corr_val < -0.2:
            lines.append("→ Higher spawn interval MIN may be increasing difficulty.")
        else:
            lines.append("→ Weak relationship detected.")

    return "\n".join(lines)


def save_report(text):
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"📄 Report saved to: {REPORT_FILE}")


def main():
    df = load_data()
    df = clean_data(df)

    correlations = compute_correlations(df)
    report = generate_report(df, correlations)

    print(report)
    save_report(report)


if __name__ == "__main__":
    main()