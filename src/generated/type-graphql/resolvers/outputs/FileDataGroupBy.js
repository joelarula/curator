"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataGroupBy = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const FileDataAvgAggregate_1 = require("../outputs/FileDataAvgAggregate");
const FileDataCountAggregate_1 = require("../outputs/FileDataCountAggregate");
const FileDataMaxAggregate_1 = require("../outputs/FileDataMaxAggregate");
const FileDataMinAggregate_1 = require("../outputs/FileDataMinAggregate");
const FileDataSumAggregate_1 = require("../outputs/FileDataSumAggregate");
let FileDataGroupBy = class FileDataGroupBy {
};
exports.FileDataGroupBy = FileDataGroupBy;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataGroupBy.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataGroupBy.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataGroupBy.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataGroupBy.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], FileDataGroupBy.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataGroupBy.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], FileDataGroupBy.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], FileDataGroupBy.prototype, "projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataGroupBy.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], FileDataGroupBy.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCountAggregate_1.FileDataCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCountAggregate_1.FileDataCountAggregate)
], FileDataGroupBy.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataAvgAggregate_1.FileDataAvgAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataAvgAggregate_1.FileDataAvgAggregate)
], FileDataGroupBy.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataSumAggregate_1.FileDataSumAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataSumAggregate_1.FileDataSumAggregate)
], FileDataGroupBy.prototype, "_sum", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataMinAggregate_1.FileDataMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataMinAggregate_1.FileDataMinAggregate)
], FileDataGroupBy.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataMaxAggregate_1.FileDataMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataMaxAggregate_1.FileDataMaxAggregate)
], FileDataGroupBy.prototype, "_max", void 0);
exports.FileDataGroupBy = FileDataGroupBy = tslib_1.__decorate([
    TypeGraphQL.ObjectType("FileDataGroupBy", {})
], FileDataGroupBy);
