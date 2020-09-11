terraform {
    required_version = "~> 0.12.29"

    required_providers {
        aws = {
            source  = "hashicorp/aws"
            version = "~> 3.1.0"
        }
    }
}

provider "aws" {
    region = "eu-central-1"
}

resource "aws_s3_bucket" "deployment_packages" {
    bucket = "lambda-benchmark-deployment-packages"
    acl = "private"

    force_destroy = true

    tags = {
        "Project" = "LambdaBenchmark",
    }
}

resource "aws_s3_bucket_public_access_block" "deployment_packages" {
    bucket = aws_s3_bucket.deployment_packages.id

    block_public_acls   = true
    block_public_policy = true
    restrict_public_buckets = true
    ignore_public_acls = true
}

resource "aws_s3_bucket" "test_data" {
    bucket = "lambda-benchmark-test-data"
    acl = "private"

    force_destroy = true

    tags = {
        "Project" = "LambdaBenchmark",
    }
}

resource "aws_s3_bucket_public_access_block" "test_data" {
    bucket = aws_s3_bucket.test_data.id

    block_public_acls   = true
    block_public_policy = true
    restrict_public_buckets = true
    ignore_public_acls = true
}

resource "aws_iam_policy" "benchmar_permissions" {
    name = "benchmark-permissions"
    description = "Policy containing permissions for the tested lambdas."
    policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement":[
        {
            "Sid": "changeDB",
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:DeleteItem",
                "dynamodb:UpdateItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:UpdateTimeToLive",
                "dynamodb:ConditionCheck"
            ],
            "Resource": ["${aws_dynamodb_table.file_permissions.arn}"]
        },
        {
            "Sid": "listBucket",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": ["${aws_s3_bucket.user_data.arn}"]
        },
        {
            "Sid": "accessUserS3",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:GetObjectTagging",
                "s3:PutObject",
                "s3:PutObjectTagging",
                "s3:DeleteObject",
                "s3:DeleteObjectTagging"
            ],
            "Resource": ["${aws_s3_bucket.user_data.arn}/*"]
        }
    ]
}
EOF
}