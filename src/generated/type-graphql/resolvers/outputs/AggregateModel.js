"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateModel = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelAvgAggregate_1 = require("../outputs/ModelAvgAggregate");
const ModelCountAggregate_1 = require("../outputs/ModelCountAggregate");
const ModelMaxAggregate_1 = require("../outputs/ModelMaxAggregate");
const ModelMinAggregate_1 = require("../outputs/ModelMinAggregate");
const ModelSumAggregate_1 = require("../outputs/ModelSumAggregate");
let AggregateModel = class AggregateModel {
};
exports.AggregateModel = AggregateModel;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelCountAggregate_1.ModelCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelCountAggregate_1.ModelCountAggregate)
], AggregateModel.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelAvgAggregate_1.ModelAvgAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelAvgAggregate_1.ModelAvgAggregate)
], AggregateModel.prototype, "_avg", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelSumAggregate_1.ModelSumAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelSumAggregate_1.ModelSumAggregate)
], AggregateModel.prototype, "_sum", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelMinAggregate_1.ModelMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelMinAggregate_1.ModelMinAggregate)
], AggregateModel.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelMaxAggregate_1.ModelMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelMaxAggregate_1.ModelMaxAggregate)
], AggregateModel.prototype, "_max", void 0);
exports.AggregateModel = AggregateModel = tslib_1.__decorate([
    TypeGraphQL.ObjectType("AggregateModel", {})
], AggregateModel);
