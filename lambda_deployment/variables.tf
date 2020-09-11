variable "function_name" {
    type = string
    description = "Name of the function, in the form of \"part1-part2-part3-...\""
}

variable "deployment_package_path" {
    type = string
    description = "Path of the deployment zip file which will be deployed to lambda."
}

variable "function_description" {
    type = string
    description = "HUman readable description of the function's purpose."
}

variable "handler" {
    type = string
    description = "Handler to be invoked by lambda, in the format <file_name>.<function_name>"
}

variable "environment_variables" {
    type = map(string)
    description = "Environment variables to be given during execution."
}

variable "log_retention_days" {
    type = number
    description = "Time for which the logs of lambda functions and other services should be kept."
}

variable "policies_arn" {
    type = list(string)
    description = "ARNs of policies to be attached to the role assumed by the lambda."
    default = []
}

variable "function_timeout" {
    type = number
    description = "Number of seconds after which the lambda will be killed."
}

variable "deployment_bucket" {
    type = string
    description = "Bucket to which the deployment package should be uploaded to."
}

variable "deployment_package_key" {
    type = string
    description = "Key used to store the deployment package with in the bucket."
}

variable "runtime" {
    type = string
    description = "Runtime used for the deployed function."
}