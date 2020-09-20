terraform {
    required_version = "~> 0.12.29"

    required_providers {
        aws = {
            source  = "hashicorp/aws"
            version = "~> 3.1.0"
        }

        local = {
            source = "hashicorp/local"
            version = "~> 1.4.0"
        }
    }
}

provider "aws" {
    region = "eu-central-1"
    profile = var.aws_credentials_profile
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

resource "aws_dynamodb_table" "test_permissions" {
    name            = "lambda-benchmark-test-permissions"
    // FUTURE: Change to PROVISIONED, it is 6x cheaper when used to 100%
    // For testing and development, pay per request is ideal
    billing_mode    = "PAY_PER_REQUEST"
    hash_key        = "user"
    range_key       = "path"

    attribute {
        name = "user"
        type = "S"
    }

    attribute {
        name = "path"
        type = "S"
    }

    ttl {
        attribute_name  = "delete-time"
        enabled         = true
    }

    tags = {
        "Project" = "LambdaBenchmark",
    }
}

resource "aws_iam_policy" "benchmark_permissions" {
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
                "dynamodb:ConditionCheck",
                "dynamodb:DescribeTable"
            ],
            "Resource": ["${aws_dynamodb_table.test_permissions.arn}"]
        },
        {
            "Sid": "listBucket",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": ["${aws_s3_bucket.test_data.arn}"]
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
            "Resource": ["${aws_s3_bucket.test_data.arn}/*"]
        }
    ]
}
EOF
}

module "experiments" {
    source = "./experiments"

    aws_credentials_profile = var.aws_credentials_profile
    lambda_functions = local.lambda_functions
    bucket_name = aws_s3_bucket.test_data.id
    table_name = aws_dynamodb_table.test_permissions.name
}