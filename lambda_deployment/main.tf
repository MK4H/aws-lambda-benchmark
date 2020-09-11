terraform {
    required_version = ">= 0.12.29"

    required_providers {
        aws = {
            source  = "hashicorp/aws"
            version = ">= 3.1.0"
        }
    }
}

// AWS Managed policy
// Gives lambda access to Cloudwatch, to collect logs and metrics
data "aws_iam_policy" "basic_lambda" {
    arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_s3_bucket_object" "deployment_package" {
    bucket = var.deployment_bucket
    key = var.deployment_package_key
    source = var.deployment_package_path

    etag = filemd5(var.deployment_package_path)
}

resource "aws_lambda_function" "function" {
    function_name   = var.function_name
    role            = aws_iam_role.function_role.arn
    description     = var.function_description
    runtime         = var.runtime
    s3_bucket       = var.deployment_bucket
    s3_key          = aws_s3_bucket_object.deployment_package.key

    // Used for detecting changes in the byte code to deploy, to prevent unnecessary deployments of the same code
    // source_code_hash = filebase64sha256(var.deployment_package_path)
    handler         = var.handler
    timeout         = var.function_timeout // seconds


    tags = {
        "Project" = "LambdaBenchmark",
    }

    environment {
        variables = var.environment_variables
    }

    depends_on = [  aws_cloudwatch_log_group.function_log_group,
                    aws_iam_role_policy_attachment.basic_attachment,
                    aws_iam_role_policy_attachment.attachments]
}

resource "aws_iam_role" "function_role" {
    name = var.function_name
    assume_role_policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "attachToLambda",
            "Action": "sts:AssumeRole",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Effect": "Allow"
        }
    ]
}
EOF

    tags = {
        "Project" = "LambdaBenchmark",
    }
}

resource "aws_cloudwatch_log_group" "function_log_group" {
    name = "/aws/lambda/${var.function_name}"
    retention_in_days = var.log_retention_days

    tags = {
        Project = "LambdaBenchmark",
    }
}

// Attaches the basic lambda policy managed by AWS to the lambda
// Allows write access to Cloudwatch logs
resource "aws_iam_role_policy_attachment" "basic_attachment" {
    role = aws_iam_role.function_role.name
    policy_arn = data.aws_iam_policy.basic_lambda.arn
}

resource "aws_iam_role_policy_attachment" "attachments" {
    count = length(var.policies_arn)

    role = aws_iam_role.function_role.name
    policy_arn = var.policies_arn[count.index]
}
