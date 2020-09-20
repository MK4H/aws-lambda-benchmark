variable "lambda_functions" {
    type = map(string)
    description = "Mapping of languages to AWS Lambda function ARNs implemented using that language."
}

variable "aws_credentials_profile" {
    type = string
    description = "Profile used to retrieve AWS credentials."
}

variable "bucket_name" {
    type = string
    description = "Name of the test bucket."
}

variable "table_name" {
    type = string
    description = "Name of the test table."
}