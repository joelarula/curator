"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateFileData = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataAvgAggregate_1 = require("../outputs/FileDataAvgAggregate");
const FileDataCountAggregate_1 = require("../outputs/FileDataCountAggregate");
const FileDataMaxAggregate_1 = require("../outputs/FileDataMaxAggregate");
const FileDataMinAggregate_1 = require("../outputs/FileDataMinAggregate");
const FileDataSumAggregate_1 = require("../outputs/FileDataSumAggregate");
let AggregateFileData = class AggregateFileData {
};
exports.AggregateFileData = AggregateFileData;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCountAggregate_1.FileDataCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCountAggregate_1.FileDataCountAggregate)
], AggregateFileData.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataAvgAggregate_1.FileDataAvgAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataAvgAggregate_1.FileDataAvgAggregate)
], AggregateFileData.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataSumAggregate_1.FileDataSumAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataSumAggregate_1.FileDataSumAggregate)
], AggregateFileData.prototype, "_sum", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataMinAggregate_1.FileDataMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataMinAggregate_1.FileDataMinAggregate)
], AggregateFileData.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataMaxAggregate_1.FileDataMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataMaxAggregate_1.FileDataMaxAggregate)
], AggregateFileData.prototype, "_max", void 0);
exports.AggregateFileData = AggregateFileData = tslib_1.__decorate([
    TypeGraphQL.ObjectType("AggregateFileData", {})
], AggregateFileData);
