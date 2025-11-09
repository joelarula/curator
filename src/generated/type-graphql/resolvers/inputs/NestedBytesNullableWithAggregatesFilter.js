"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NestedBytesNullableWithAggregatesFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const NestedBytesNullableFilter_1 = require("../inputs/NestedBytesNullableFilter");
const NestedIntNullableFilter_1 = require("../inputs/NestedIntNullableFilter");
let NestedBytesNullableWithAggregatesFilter = class NestedBytesNullableWithAggregatesFilter {
};
exports.NestedBytesNullableWithAggregatesFilter = NestedBytesNullableWithAggregatesFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], NestedBytesNullableWithAggregatesFilter.prototype, "equals", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], NestedBytesNullableWithAggregatesFilter.prototype, "in", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], NestedBytesNullableWithAggregatesFilter.prototype, "notIn", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableWithAggregatesFilter)
], NestedBytesNullableWithAggregatesFilter.prototype, "not", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedIntNullableFilter_1.NestedIntNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedIntNullableFilter_1.NestedIntNullableFilter)
], NestedBytesNullableWithAggregatesFilter.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableFilter_1.NestedBytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableFilter_1.NestedBytesNullableFilter)
], NestedBytesNullableWithAggregatesFilter.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableFilter_1.NestedBytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableFilter_1.NestedBytesNullableFilter)
], NestedBytesNullableWithAggregatesFilter.prototype, "_max", void 0);
exports.NestedBytesNullableWithAggregatesFilter = NestedBytesNullableWithAggregatesFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("NestedBytesNullableWithAggregatesFilter", {})
], NestedBytesNullableWithAggregatesFilter);
