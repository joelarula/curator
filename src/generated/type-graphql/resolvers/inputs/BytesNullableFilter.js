"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BytesNullableFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const NestedBytesNullableFilter_1 = require("../inputs/NestedBytesNullableFilter");
let BytesNullableFilter = class BytesNullableFilter {
};
exports.BytesNullableFilter = BytesNullableFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], BytesNullableFilter.prototype, "equals", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], BytesNullableFilter.prototype, "in", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], BytesNullableFilter.prototype, "notIn", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableFilter_1.NestedBytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableFilter_1.NestedBytesNullableFilter)
], BytesNullableFilter.prototype, "not", void 0);
exports.BytesNullableFilter = BytesNullableFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("BytesNullableFilter", {})
], BytesNullableFilter);
