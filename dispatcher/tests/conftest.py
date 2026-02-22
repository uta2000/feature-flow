import sqlite3

import pytest

from dispatcher.db import init_db


@pytest.fixture
def db():
    conn = init_db(":memory:")
    yield conn
    conn.close()
