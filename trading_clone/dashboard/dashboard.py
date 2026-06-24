import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def run_dashboard(port: int = 8050) -> None:
    try:
        import dash
        from dash import dcc, html
        from dash.dependencies import Input, Output
        import plotly.graph_objs as go

        app = dash.Dash(__name__, title="TradeClone Dashboard")

        app.layout = html.Div(style={"backgroundColor": "#0d1117", "minHeight": "100vh",
                                     "fontFamily": "monospace", "color": "#e6edf3"}, children=[
            html.H1("TradeClone AI Dashboard", style={"textAlign": "center", "padding": "20px",
                                                       "color": "#58a6ff"}),
            dcc.Interval(id="refresh", interval=10_000, n_intervals=0),
            html.Div(id="stats", style={"textAlign": "center", "padding": "10px"}),
        ])

        @app.callback(Output("stats", "children"), Input("refresh", "n_intervals"))
        def update_stats(n):
            now = datetime.now(timezone.utc)
            return html.P(f"Last updated: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}",
                          style={"color": "#8b949e"})

        logger.info("Dashboard starting on port %d", port)
        app.run(debug=False, port=port, host="0.0.0.0")
    except ImportError:
        logger.warning("Dash not installed — dashboard unavailable. Install: pip install dash")
