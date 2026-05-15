"""
Drop-in replacement for get_predictions_graph() in your main.py
Also includes get_date_series() if you don't have it.

Paste these two functions into main.py (replace existing ones).
"""

import io
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as mticker
from fastapi.responses import StreamingResponse


def get_date_series(df: pd.DataFrame) -> pd.Series:
    """
    Finds the date column in df and returns it as a DatetimeSeries.
    Tries common column names; falls back to the index if nothing found.
    """
    date_col_candidates = [
        c for c in df.columns
        if any(k in c.lower() for k in ('date', 'time', 'period', 'month', 'year'))
    ]
    if date_col_candidates:
        col = date_col_candidates[0]
        return pd.to_datetime(df[col], errors='coerce')
    # Fallback: try to parse the index
    try:
        return pd.to_datetime(df.index, errors='coerce')
    except Exception:
        return pd.Series(pd.date_range(start='2023-01-01', periods=len(df), freq='MS'))


def get_predictions_graph(
    pipelines: dict,
    X_test,
    y_test,
    date_series: pd.Series,
) -> StreamingResponse:
    """
    Generates a clean Net Income Prediction Comparison chart:
      - X-axis: years only, with vertical dividers between years
      - Actual Net Income: solid black line
      - Each model: distinct dashed coloured line
      - Clean legend, no zigzag mess (data sorted by date)

    Args:
        pipelines : dict of {model_name: fitted_pipeline}
        X_test    : test features (DataFrame or array)
        y_test    : true target values (Series)
        date_series: full-length DatetimeSeries aligned to the original df index

    Returns:
        StreamingResponse (PNG image)
    """

    # ── 1. Build predictions DataFrame ────────────────────────────────────────
    pred_dict = {"Actual": y_test.copy()}
    for name, pipeline in pipelines.items():
        pred_dict[name] = pd.Series(pipeline.predict(X_test), index=y_test.index)

    plot_df = pd.DataFrame(pred_dict)

    # ── 2. Attach dates & SORT (this fixes the zigzag) ───────────────────────
    # date_series is aligned to the full df; reindex to test indices
    if isinstance(date_series, pd.Series):
        dates_for_test = date_series.reindex(y_test.index)
    else:
        dates_for_test = pd.Series(date_series, index=range(len(date_series))).reindex(y_test.index)

    plot_df['Date'] = dates_for_test.values
    plot_df['Date'] = pd.to_datetime(plot_df['Date'], errors='coerce')

    # Drop rows with no date, then sort
    plot_df = plot_df.dropna(subset=['Date']).sort_values('Date').reset_index(drop=True)

    # ── 3. Style config ───────────────────────────────────────────────────────
    MODEL_STYLES = {
        # name            colour        linestyle  linewidth  zorder
        'RandomForest':   ('#00BCD4', '--', 2.2, 3),
        'GradientBoosting': ('#E040FB', '--', 2.2, 3),
        'SVR':            ('#FF9800', '--', 2.2, 3),
    }
    # Fallback palette for extra models
    FALLBACK_COLORS = ['#4CAF50', '#F44336', '#9C27B0', '#3F51B5', '#009688']

    # ── 4. Plot ───────────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(14, 6))
    fig.patch.set_facecolor('#FAFAFA')
    ax.set_facecolor('#F5F7FA')
    ax.grid(True, which='major', linestyle='--', linewidth=0.5, color='#D0D7DE', alpha=0.8)

    dates = plot_df['Date']

    # — Shade alternating year bands ——————————————————————————————————————————
    years = sorted(plot_df['Date'].dt.year.unique())
    for i, yr in enumerate(years):
        yr_mask = plot_df['Date'].dt.year == yr
        if yr_mask.any():
            yr_start = plot_df.loc[yr_mask, 'Date'].min()
            yr_end   = plot_df.loc[yr_mask, 'Date'].max()
            ax.axvspan(yr_start, yr_end,
                       color='#E3F2FD' if i % 2 == 0 else '#EDE7F6',
                       alpha=0.35, zorder=0)

    # — Year divider vertical lines ————————————————————————————————————————————
    for yr in years[1:]:
        divider_date = pd.Timestamp(f'{yr}-01-01')
        ax.axvline(divider_date, color='#90A4AE', linewidth=1.2,
                   linestyle='-', alpha=0.7, zorder=2)
        ax.text(divider_date, ax.get_ylim()[1] if ax.get_ylim()[1] != 1.0 else plot_df['Actual'].max(),
                f' {yr}', color='#546E7A', fontsize=9, va='top', ha='left', zorder=5)

    # — Actual net income (solid black) ————————————————————————————————————————
    ax.plot(dates, plot_df['Actual'],
            color='#1A1A2E', linewidth=2.4, label='Actual Net Income',
            zorder=4, solid_capstyle='round')

    # — Model predictions ——————————————————————————————————————————————————————
    fallback_idx = 0
    model_cols = [c for c in plot_df.columns if c not in ('Actual', 'Date')]

    for col in model_cols:
        if col in MODEL_STYLES:
            color, ls, lw, zo = MODEL_STYLES[col]
        else:
            color = FALLBACK_COLORS[fallback_idx % len(FALLBACK_COLORS)]
            fallback_idx += 1
            ls, lw, zo = '--', 2.0, 3

        ax.plot(dates, plot_df[col],
                color=color, linewidth=lw, linestyle=ls,
                label=f'{col} Prediction', zorder=zo,
                alpha=0.92)

    # ── 5. X-axis: years only ─────────────────────────────────────────────────
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
    ax.xaxis.set_minor_locator(mdates.MonthLocator(bymonth=[4, 7, 10]))  # Q markers
    plt.setp(ax.get_xticklabels(), fontsize=11, fontweight='600', color='#37474F')

    # ── 6. Y-axis: currency format ────────────────────────────────────────────
    ax.yaxis.set_major_formatter(
        mticker.FuncFormatter(lambda x, _: f'{x:,.0f}')
    )
    plt.setp(ax.get_yticklabels(), fontsize=10, color='#37474F')

    # ── 7. Labels & legend ────────────────────────────────────────────────────
    ax.set_title('Net Income Prediction Comparison', fontsize=15, fontweight='bold',
                 color='#1A1A2E', pad=14)
    ax.set_xlabel('Year', fontsize=11, color='#37474F', labelpad=8)
    ax.set_ylabel('Net Income', fontsize=11, color='#37474F', labelpad=8)

    legend = ax.legend(
        loc='upper left', fontsize=10,
        framealpha=0.92, edgecolor='#CFD8DC',
        fancybox=True, shadow=False,
        labelcolor='#1A1A2E'
    )
    legend.get_frame().set_linewidth(0.8)

    # Re-draw year labels now that ylim is set
    ymax = plot_df[['Actual'] + model_cols].max().max()
    for yr in years[1:]:
        divider_date = pd.Timestamp(f'{yr}-01-01')
        # find existing texts and update y position
        for txt in ax.texts:
            if txt.get_text().strip() == str(yr):
                txt.set_y(ymax * 0.97)

    ax.set_xlim(dates.min(), dates.max())
    plt.tight_layout()

    # ── 8. Return as streaming PNG ────────────────────────────────────────────
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)

    return StreamingResponse(buf, media_type='image/png')