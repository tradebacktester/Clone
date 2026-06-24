from setuptools import setup, find_packages

setup(
    name="trading_clone",
    version="1.0.0",
    description="Smart Money / Supply & Demand / AMD trading system",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "aiohttp>=3.9",
        "numpy>=1.26",
    ],
    extras_require={
        "dashboard": ["dash>=2.14", "plotly>=5.18"],
        "dev": ["pytest>=8.0", "pytest-asyncio>=0.23"],
    },
)
