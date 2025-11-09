"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BytesNullableWithAggregatesFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const NestedBytesNullableFilter_1 = require("../inputs/NestedBytesNullableFilter");
const NestedBytesNullableWithAggregatesFilter_1 = require("../inputs/NestedBytesNullableWithAggregatesFilter");
const NestedIntNullableFilter_1 = require("../inputs/NestedIntNullableFilter");
let BytesNullableWithAggregatesFilter = class BytesNullableWithAggregatesFilter {
};
exports.BytesNullableWithAggregatesFilter = BytesNullableWithAggregatesFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], BytesNullableWithAggregatesFilter.prototype, "equals", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], BytesNullableWithAggregatesFilter.prototype, "in", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], BytesNullableWithAggregatesFilter.prototype, "notIn", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableWithAggregatesFilter_1.NestedBytesNullableWithAggregatesFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableWithAggregatesFilter_1.NestedBytesNullableWithAggregatesFilter)
], BytesNullableWithAggregatesFilter.prototype, "not", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedIntNullableFilter_1.NestedIntNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedIntNullableFilter_1.NestedIntNullableFilter)
], BytesNullableWithAggregatesFilter.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableFilter_1.NestedBytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableFilter_1.NestedBytesNullableFilter)
], BytesNullableWithAggregatesFilter.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableFilter_1.NestedBytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableFilter_1.NestedBytesNullableFilter)
], BytesNullableWithAggregatesFilter.prototype, "_max", void 0);
exports.BytesNullableWithAggregatesFilter = BytesNullableWithAggregatesFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("BytesNullableWithAggregatesFilter", {})
], BytesNullableWithAggregatesFilter);
