import pandas as pd
from build_jeonse import aggregate_cells, trimmed_mean, full_months, format_won


def test_trimmed_mean_drops_outliers():
    s = pd.Series([100] * 9 + [10000])
    assert trimmed_mean(s) is not None
    assert trimmed_mean(s) < s.mean()


def test_trimmed_mean_none_under_ten():
    assert trimmed_mean(pd.Series([100] * 9)) is None


def test_full_months_drops_thin_edges():
    counts = pd.Series({202511: 374, 202512: 4082, 202601: 19977,
                        202602: 16431, 202603: 18582, 202604: 16215,
                        202605: 15620, 202606: 15227, 202607: 13461, 202608: 1690})
    assert full_months(counts) == [202601, 202602, 202603, 202604, 202605, 202606, 202607]


def test_aggregate_cells_shape():
    df = pd.DataFrame({"CGG_NM": ["강남구"] * 3, "STDG_NM": ["개포동"] * 3,
                       "BLDG_USG": ["아파트"] * 3, "GRFE": [100.0, 200.0, 300.0]})
    cells = aggregate_cells(df)
    assert cells["강남구"]["개포동"]["아파트"] == [200.0, 3, None]


def test_format_won():
    assert format_won(90199) == "9억 199만원"
    assert format_won(450000) == "45억원"
    assert format_won(9800) == "9,800만원"
