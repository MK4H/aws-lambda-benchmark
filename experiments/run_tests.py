from experimet_properties import ExperimentProperties
from typing import List, Dict
import json
import boto3
from botocore.exceptions import ClientError
import random

NUM_TEST_ROUNDS = 100
NUM_INVOCATIONS_IN_ROUND = 3

properties = ExperimentProperties.from_params_file()
boto3.setup_default_session(profile_name=properties.aws_credentials_profile)
lambda_client = boto3.client("lambda")
bucket = boto3.resource("s3").Bucket(properties.bucket_name)
db = boto3.resource("dynamodb").Table(properties.table_name)

def get_file_names(count: int):
    return [f"file{i}" for i in range(count)]

def invoke_lambda(lang: str, arn: str, filename: str):
    print(f"Invoking {lang} lambda")
    response = lambda_client.invoke(
        FunctionName=arn,
        Payload=json.dumps({
            "userID": lang,
            "filePath": f"/{lang}/{filename}"
        }).encode("utf-8")
    )
    print(response["Payload"].read())


def reset_lambda(lang: str, arn: str, iteration: int):
    lambda_client.update_function_configuration(
        FunctionName=arn,
        Description=f"Lambda function implemented using {lang} for the iteration {iteration}"
    )


def cleanup(langs: List[str], filenames: List[str]):
    bucket.delete_objects(
        Delete={
            "Objects": [{"Key": f"{lang}/{file}"} for file in filenames for lang in langs],
            "Quiet": True
        }
    )

    with db.batch_writer() as batch:
        for lang in langs:
            for file in filenames:
                batch.delete_item(
                    Key={"user": lang, "path": f"{lang}/{file}"}
                )


def run_test_round(properties: ExperimentProperties, num_invocations: int, test_round_number: int):
    filenames = get_file_names(num_invocations)
    lambda_functions = list(properties.lambda_functions.items())
    random.shuffle(lambda_functions)
    try:
        for lang, arn in lambda_functions:
            for file in filenames:
                invoke_lambda(lang, arn, file)

            reset_lambda(lang, arn, test_round_number)
    except ClientError as e:
        print(f"Test round failed with error: {e}")
        raise
    finally:
        cleanup(properties.lambda_functions.keys(), filenames)



def run_main(properties: ExperimentProperties):
    for test_round in range(NUM_TEST_ROUNDS):
        print("--------------------------")
        print("Running round:", test_round)
        run_test_round(properties, NUM_INVOCATIONS_IN_ROUND, test_round)


if __name__ == "__main__":
    try:
        run_main(properties)
    except KeyboardInterrupt:
        print("Interrupted...")
