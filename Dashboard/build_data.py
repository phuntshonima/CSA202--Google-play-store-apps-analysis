import json
import os
import pandas as pd

SRC = "data/googleplaystore_clean.csv"
OUT = "site/data.json"

df = pd.read_csv(SRC, parse_dates=["Last Updated"])

# Helper column
ref_date = df["Last Updated"].max()
df["Days_Since_Update"] = (ref_date - df["Last Updated"]).dt.days

# selecting columns 
keep = ["App", "Category", "Rating", "Reviews", "Installs", "Type",
        "Price", "Size_MB", "Content Rating", "Days_Since_Update"]
df = df[keep].rename(columns={"Content Rating": "ContentRating"})

# replacing _ in values with space
df["Category"] = df["Category"].str.replace("_", " ").str.title()

df["Rating"] = df["Rating"].round(1)
df["Size_MB"] = df["Size_MB"].round(1)

# NaN isn't valid in json so we replace with None, we use notna as .where does opposite of what is expected
df = df.astype(object).where(df.notna(), None)

payload = {col: df[col].tolist() for col in df.columns}
payload["_meta"] = {"rows": len(df), "ref_date": str(ref_date.date())}

os.makedirs("site", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(payload, f, separators=(",", ":"))

print(f"Wrote {OUT}: {len(df)} apps")