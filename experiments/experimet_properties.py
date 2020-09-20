import json
from pathlib import Path
from typing import Dict

PARAMS_PATH = Path(__file__).parent.joinpath("params.json")


class ExperimentProperties:
    lambda_functions: Dict[str, str]
    aws_credentials_profile: str
    bucket_name: str
    table_name: str

    def __init__(self, lambda_functions, aws_credentials_profile, bucket_name, table_name):
        self.lambda_functions = lambda_functions
        self.aws_credentials_profile = aws_credentials_profile
        self.bucket_name = bucket_name
        self.table_name = table_name

    @classmethod
    def from_params_file(cls):
        try:
            with open(PARAMS_PATH, "r") as f:
                properties = json.load(f)
                lambda_functions = properties["functions"]
                aws_credentials_profile = properties["profile"]
                bucket_name = properties["bucket_name"]
                table_name = properties["table_name"]
                return ExperimentProperties(lambda_functions, aws_credentials_profile, bucket_name, table_name)
        except IOError as e:
            print(f"Failed to read the function parameters with error: {e}")
            print("Are the functions deployed?")
            raise
