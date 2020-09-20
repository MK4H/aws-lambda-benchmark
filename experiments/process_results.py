from experimet_properties import ExperimentProperties
from typing import List, Dict
import os
import boto3
import itertools
import csv
from botocore.exceptions import ClientError

#properties = ExperimentProperties(None, "personal", None, None)
properties = ExperimentProperties.from_params_file()
boto3.setup_default_session(profile_name=properties.aws_credentials_profile)
logs = boto3.client('logs')
log_stream_paginator = logs.get_paginator("describe_log_streams")


class Event:

    # MUST MATCH THE ORDER IN THE get_csv_row method
    field_names = ["duration", "max memory", "init duration"]

    def __init__(self, line: str):
        line = line.rstrip()
        fields = line.split("\t")
        self.duration = Event._get_duration(fields[1])
        self.max_memory = Event._get_max_memory(fields[4])

        if len(fields) == 6:
            self.init_duration = Event._get_init_duration(fields[5])
        else:
            self.init_duration = None

    @staticmethod
    def _get_duration(field: str):
        parts = field.split(" ")
        if len(parts) != 3 or parts[0] != "Duration:":
            raise RuntimeError(f"Invalid duration field format: {field}")
        return float(parts[1])

    @staticmethod
    def _get_max_memory(field: str):
        parts = field.split(" ")
        if len(parts) != 5 or parts[0] != "Max" or parts[1] != "Memory" or parts[2] != "Used:":
            raise RuntimeError(f"Invalid max memory field format: {field}")
        return int(parts[3])

    @staticmethod
    def _get_init_duration(field: str):
        parts = field.split(" ")
        if len(parts) != 4 or parts[0] != "Init" or parts[1] != "Duration:":
            raise RuntimeError(f"Invalid init duration field format: {field}")
        return float(parts[2])

    def get_csv_row(self):
        # MUST MATCH THE ORDER IN THE field_names
        return [self.duration, self.max_memory, self.init_duration]


class StreamData:
    def __init__(self, first_line):
        self.index = StreamData.parse_stream_index(first_line)
        self.events = []
        self.parse_event(first_line)

    @staticmethod
    def parse_stream_index(line) -> int:
        try:
            index = int(line.split(None, 1)[0])
        except ValueError as e:
            print(f"Invalid line contents: {line}")
            raise
        return index

    def parse_event(self, line: str) -> bool:
        stream_index = StreamData.parse_stream_index(line)
        if stream_index != self.index:
            return False
        self.events.append(Event(line))
        return True

    def get_csv_rows(self):
        return [event.get_csv_row() for event in self.events]


class NullStream:
    def parse_event(self, line: str) -> bool:
        return False


class LangData:
    def __init__(self, lang):
        self.lang = lang
        self.streams = []
        if os.stat(f"{lang}-logs.txt").st_size == 0:
            return

        current_stream = NullStream()
        with open(f"{lang}-logs.txt", "r") as lang_file:
            for line in lang_file:
                current = current_stream.parse_event(line)
                if not current:
                    current_stream = StreamData(line)
                    self.streams.append(current_stream)

    def get_csv_rows(self, with_lang: bool):
        rows: List[List[str]] = list(itertools.chain(*[stream.get_csv_rows() for stream in self.streams]))
        if with_lang:
            for row in rows:
                row.append(self.lang)
        return rows


def process_events(stream_idx, events, out):
    for event in events:
        message: str = event["message"]
        if message.startswith("REPORT"):
            out.write(f"{stream_idx} {message}")


def download_language_results(lang: str):
    with open(f"{lang}-logs.txt", "w") as lang_file:
        log_group_name = f"/aws/lambda/{lang}-benchmark"
        log_stream_iterator = log_stream_paginator.paginate(
            logGroupName=log_group_name
        )
        stream_idx = 0
        for log_stream_page in log_stream_iterator:
            for log_stream in log_stream_page["logStreams"]:
                response = logs.get_log_events(
                    logGroupName=log_group_name,
                    logStreamName=log_stream["logStreamName"],
                    startFromHead=True
                )
                prev_token = None
                next_token = response["nextForwardToken"]
                process_events(stream_idx, response["events"], lang_file)
                while next_token != prev_token:
                    response = logs.get_log_events(
                        logGroupName=log_group_name,
                        logStreamName=log_stream["logStreamName"],
                        nextToken=next_token,
                        startFromHead=True
                    )
                    prev_token = next_token
                    next_token = response["nextForwardToken"]
                    process_events(stream_idx, response["events"], lang_file)
                print(f"{lang}: Downloaded stream {stream_idx}")
                stream_idx += 1


def run_main(properties: ExperimentProperties):
    with open("data.csv", "w", newline="") as csvfile:
        fieldnames = Event.field_names.copy()
        fieldnames.append("lang")
        writer = csv.writer(csvfile)
        writer.writerow(fieldnames)
        for lang in properties.lambda_functions.keys():
            print(f"Processing {lang} results")
            download_language_results(lang)
            data = LangData(lang)
            writer.writerows(data.get_csv_rows(True))


if __name__ == "__main__":
    try:
        run_main(properties)
    except KeyboardInterrupt:
        print()
