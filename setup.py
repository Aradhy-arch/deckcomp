from setuptools import setup

setup(
    name="deckcomp",
    version="1.0.0",
    description="DeckComp: Companion server & workflow controller for Linux desktop (Wayland/PipeWire) and Android",
    author="DeckComp Contributors",
    py_modules=["main", "config", "env_resolver", "subprocess_runner", "deckcomp_entry"],
    packages=["services"],
    entry_points={
        "console_scripts": [
            "deckcomp = deckcomp_entry:cli_main",
            "deck-send = deckcomp_entry:send_main",
            "deckcomp-daemon = deckcomp_entry:daemon_main",
        ]
    },
    install_requires=[
        "fastapi>=0.115.0",
        "uvicorn[standard]>=0.32.0",
        "python-multipart>=0.0.12",
        "pydantic>=2.9.0",
        "aiofiles>=24.1.0",
    ],
)
