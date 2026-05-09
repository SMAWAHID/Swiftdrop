"""
SwiftDrop :: pytest configuration

Adds the backend/ directory to sys.path so test files can import
`factories.shipment_factory`, `services.signup_service`, etc. without
needing the project to be installed as a package.
"""
import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
