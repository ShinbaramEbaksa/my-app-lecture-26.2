"""원본 계약 CSV를 브라우저가 받아갈 작은 JSON 과 GeoJSON 으로 줄인다.

실행: ../.venv/bin/python tools/build_jeonse.py
"""
import json
import pathlib

import pandas as pd
from scipy import stats

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
SOURCE_DIR = REPO.parent  # 강의 자료가 있는 상위 폴더
OUT_DIR = REPO / "public" / "data"

RENT_CSV = SOURCE_DIR / "lecture03_data_visualization" / "data" / "seoul_rent_2026.csv"
GEOCODED_CSV = SOURCE_DIR / "lecture04_spatial_data_analysis" / "data" / "seoul_apt_price_2026_geocoded.csv"
DONG_GEOJSON = SOURCE_DIR / "lecture06_Living_Population" / "data" / "HangJeongDong_ver20250101.geojson"

TRIM = 0.10
MIN_FOR_TRIM = 10
RAMP_STEPS = 5


def trimmed_mean(series):
    """양측 10% 를 버린 평균. 표본이 10건 미만이면 의미가 없어 None."""
    if len(series) < MIN_FOR_TRIM:
        return None
    return round(float(stats.trim_mean(series, TRIM)), 0)


def full_months(counts):
    """집계가 잘린 달을 버린다. 서울 전체 거래량이 중앙값의 절반에 못 미치면 반쪽짜리."""
    floor = counts.median() * 0.5
    return sorted(int(m) for m in counts[counts >= floor].index)


def aggregate_cells(df):
    cells = {}
    for (gu, dong, usg), s in df.groupby(["CGG_NM", "STDG_NM", "BLDG_USG"])["GRFE"]:
        cells.setdefault(gu, {}).setdefault(dong, {})[usg] = [
            round(float(s.mean()), 0), int(len(s)), trimmed_mean(s)
        ]
    return cells


def format_won(value):
    total = int(round(value))
    eok, man = divmod(total, 10000)
    if eok and man:
        return f"{eok}억 {man:,}만원"
    if eok:
        return f"{eok}억원"
    return f"{man:,}만원"


def dong_points(geocoded):
    """법정동 대표 좌표. 아파트 거래가 없는 동은 빠지며, 쓰는 쪽이 자치구로 물러난다."""
    clean = geocoded.dropna(subset=["LAT", "LON"])
    grouped = clean.groupby(["CGG_NM", "STDG_NM"])[["LAT", "LON"]].median()
    return {f"{gu}|{dong}": [round(r.LAT, 5), round(r.LON, 5)]
            for (gu, dong), r in grouped.iterrows()}


def gu_geojson(path):
    import geopandas as gpd

    g = gpd.read_file(path)
    gu = g[g.sidonm == "서울특별시"].dissolve(by="sggnm").reset_index()[["sggnm", "geometry"]]
    gu["geometry"] = gu.geometry.simplify(0.001, preserve_topology=True)
    return json.loads(gu.to_json())


def quantile_cuts(values):
    ordered = sorted(values)
    return [ordered[int(len(ordered) * i / RAMP_STEPS)] for i in range(1, RAMP_STEPS)]


def main():
    rent = pd.read_csv(RENT_CSV, encoding="utf-8-sig", low_memory=False)
    jeonse = rent[rent.RENT_SE == "전세"].copy()
    jeonse["월"] = (jeonse.CTRT_DAY // 100).astype(int)

    months = full_months(jeonse.groupby("월").size())
    windowed = jeonse[jeonse.월.isin(months)]

    gu = {name: [round(float(s.mean()), 0), int(len(s)), trimmed_mean(s)]
          for name, s in jeonse.groupby("CGG_NM")["GRFE"]}
    monthly = {name: [round(float(windowed[(windowed.CGG_NM == name) & (windowed.월 == m)].GRFE.mean()), 0)
                      for m in months] for name in gu}

    payload = {
        "cells": aggregate_cells(jeonse),
        "gu": gu,
        "monthly": monthly,
        "months": [f"{m % 100}월" for m in months],
        "seoul": [round(float(jeonse.GRFE.mean()), 0), int(len(jeonse)), trimmed_mean(jeonse.GRFE)],
        "dongPoints": dong_points(pd.read_csv(GEOCODED_CSV, low_memory=False)),
        "cuts": quantile_cuts([v[0] for v in gu.values()]),
        "period": f"{min(jeonse.월) // 100}년 {min(jeonse.월) % 100}월 ~ "
                  f"{max(jeonse.월) // 100}년 {max(jeonse.월) % 100}월",
        "total": f"{len(jeonse):,}",
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "jeonse.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT_DIR / "seoul-gu.geojson").write_text(
        json.dumps(gu_geojson(DONG_GEOJSON), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"자치구 {len(payload['gu'])} · 동 좌표 {len(payload['dongPoints'])} · 월 {payload['months']}")


if __name__ == "__main__":
    main()
