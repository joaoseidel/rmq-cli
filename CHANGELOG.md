## [1.2.1](https://github.com/joaoseidel/rmq-cli/compare/v1.2.0...v1.2.1) (2025-03-26)


### Bug Fixes

* JSON serialization with polymorphic support for ConnectionInfo ([78cf0f7](https://github.com/joaoseidel/rmq-cli/commit/78cf0f7f9e04eb2358a8e0b6efeca9048050a1aa))

# [1.2.0](https://github.com/joaoseidel/rmq-cli/compare/v1.1.0...v1.2.0) (2025-03-26)


### Bug Fixes

* update parameter name in getMessages method for clarity ([babdcfa](https://github.com/joaoseidel/rmq-cli/commit/babdcfaf0381cb6d860457bace27bb78e3282f41))


### Features

* introduce CompositeMessageId for improved message identification and handling ([59afbe4](https://github.com/joaoseidel/rmq-cli/commit/59afbe4f8805b8d2e129604b4ff0dff131150daf))

# [1.1.0](https://github.com/joaoseidel/rmq-cli/compare/v1.0.0...v1.1.0) (2025-03-25)


### Bug Fixes

* change log level from warn to debug for connection close with keepAlive enabled ([373f59f](https://github.com/joaoseidel/rmq-cli/commit/373f59f1769cb2c5b588d058fbe62a3ed3a88fca))
* rename Connection to ConnectionInfo in RabbitMQClient.kt ([70c18d8](https://github.com/joaoseidel/rmq-cli/commit/70c18d8c74e6329add3e90a7129265e55fadd44c))
* semantic-release workflow configuration ([7393f2d](https://github.com/joaoseidel/rmq-cli/commit/7393f2dec44ea197d1697a9bf987b1d0c7bb456a))
* update RabbitMQConnection to handle nullable channel and connection ([a5ce99a](https://github.com/joaoseidel/rmq-cli/commit/a5ce99acd336535605923c848c81764499416510))
* update reachability metadata for connection type and add missing object type ([7b974c3](https://github.com/joaoseidel/rmq-cli/commit/7b974c3e852147cfcf5efe3513b0d8a5f6977fdb))
* update VHostOperations to use VHost and ConnectionInfo in method documentation ([416758b](https://github.com/joaoseidel/rmq-cli/commit/416758b40ba8a10e242e46977668b6b74da082ed))


### Features

* add Json configuration for serialization and update JsonSettingsStore to use it ([8b7f70d](https://github.com/joaoseidel/rmq-cli/commit/8b7f70d47e539817ac03b1e0462da45579705a65))
* add message and queue search functionality with pattern matching ([d3adbdc](https://github.com/joaoseidel/rmq-cli/commit/d3adbdc5b5e8f690bc1d14c6ca9fd5bef02c6ed9))
* add queue pattern matching and enhance message export functionality ([54a4de0](https://github.com/joaoseidel/rmq-cli/commit/54a4de021b41d5737014ff9f25411a02482ecaf1))
* enhance connection setup with type selection and port options for AMQP and HTTP ([4c2f61d](https://github.com/joaoseidel/rmq-cli/commit/4c2f61db9ea68b7df52d66f04120addfb8e1cf5e))
* implement AMQP and HTTP RabbitMQ clients with connection handling and message operations ([5aecd7a](https://github.com/joaoseidel/rmq-cli/commit/5aecd7a46db9f10ecbd75c676840b9e61bbe95d8))

# 1.0.0 (2025-03-24)


### Features

* add github workflows for releasing the native package ([f392af7](https://github.com/joaoseidel/rmq-cli/commit/f392af7eec263da5c648ede97ac47d7f44e40843))
* add github workflows for semantic releasing ([471e0cd](https://github.com/joaoseidel/rmq-cli/commit/471e0cdbcee0f8381a0c20c696d98cd18d170e96))
