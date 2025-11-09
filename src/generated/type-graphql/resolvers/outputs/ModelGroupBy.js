"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelGroupBy = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelAvgAggregate_1 = require("../outputs/ModelAvgAggregate");
const ModelCountAggregate_1 = require("../outputs/ModelCountAggregate");
const ModelMaxAggregate_1 = require("../outputs/ModelMaxAggregate");
const ModelMinAggregate_1 = require("../outputs/ModelMinAggregate");
const ModelSumAggregate_1 = require("../outputs/ModelSumAggregate");
let ModelGroupBy = class ModelGroupBy {
};
exports.ModelGroupBy = ModelGroupBy;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], ModelGroupBy.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelGroupBy.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ModelGroupBy.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ModelGroupBy.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCountAggregate_1.ModelCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelCountAggregate_1.ModelCountAggregate)
], ModelGroupBy.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelAvgAggregate_1.ModelAvgAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelAvgAggregate_1.ModelAvgAggregate)
], ModelGroupBy.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelSumAggregate_1.ModelSumAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelSumAggregate_1.ModelSumAggregate)
], ModelGroupBy.prototype, "_sum", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelMinAggregate_1.ModelMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelMinAggregate_1.ModelMinAggregate)
], ModelGroupBy.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelMaxAggregate_1.ModelMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelMaxAggregate_1.ModelMaxAggregate)
], ModelGroupBy.prototype, "_max", void 0);
exports.ModelGroupBy = ModelGroupBy = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ModelGroupBy", {})
], ModelGroupBy);
