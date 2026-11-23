class ProcessingError(Exception):
    """Expected, user-meaningful failure (bad file etc.). Mapped to HTTP 422 with a stable code."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message
