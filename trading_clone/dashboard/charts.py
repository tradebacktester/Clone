import logging
from typing import List

logger = logging.getLogger(__name__)


def equity_curve_chart(equity_curve: List[float]) -> dict:
    try:
        import plotly.graph_objs as go
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            y=equity_curve, mode="lines", name="Equity",
            line={"color": "#58a6ff", "width": 2},
        ))
        fig.update_layout(
            title="Equity Curve", template="plotly_dark",
            plot_bgcolor="#161b22", paper_bgcolor="#0d1117",
            font={"color": "#e6edf3"},
        )
        return fig.to_dict()
    except ImportError:
        logger.warning("Plotly not installed — charts unavailable")
        return {}


def pnl_bar_chart(monthly_pnl: dict) -> dict:
    try:
        import plotly.graph_objs as go
        months = list(monthly_pnl.keys())
        values = list(monthly_pnl.values())
        colors = ["#3fb950" if v >= 0 else "#f85149" for v in values]
        fig = go.Figure(go.Bar(x=months, y=values, marker_color=colors))
        fig.update_layout(title="Monthly P&L", template="plotly_dark",
                          plot_bgcolor="#161b22", paper_bgcolor="#0d1117",
                          font={"color": "#e6edf3"})
        return fig.to_dict()
    except ImportError:
        logger.warning("Plotly not installed — charts unavailable")
        return {}


def win_rate_gauge(win_rate: float) -> dict:
    try:
        import plotly.graph_objs as go
        fig = go.Figure(go.Indicator(
            mode="gauge+number", value=win_rate,
            title={"text": "Win Rate %", "font": {"color": "#e6edf3"}},
            gauge={
                "axis": {"range": [0, 100]},
                "bar": {"color": "#3fb950"},
                "steps": [
                    {"range": [0, 40], "color": "#f85149"},
                    {"range": [40, 60], "color": "#d29922"},
                    {"range": [60, 100], "color": "#3fb950"},
                ],
            },
        ))
        fig.update_layout(template="plotly_dark", paper_bgcolor="#0d1117",
                          font={"color": "#e6edf3"})
        return fig.to_dict()
    except ImportError:
        return {}
