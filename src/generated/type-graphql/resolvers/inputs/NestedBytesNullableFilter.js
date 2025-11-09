"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NestedBytesNullableFilter = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
let NestedBytesNullableFilter = class NestedBytesNullableFilter {
};
exports.NestedBytesNullableFilter = NestedBytesNullableFilter;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.ByteResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Buffer)
], NestedBytesNullableFilter.prototype, "equals", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], NestedBytesNullableFilter.prototype, "in", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [GraphQLScalars.ByteResolver], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], NestedBytesNullableFilter.prototype, "notIn", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => NestedBytesNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", NestedBytesNullableFilter)
], NestedBytesNullableFilter.prototype, "not", void 0);
exports.NestedBytesNullableFilter = NestedBytesNullableFilter = tslib_1.__decorate([
    TypeGraphQL.InputType("NestedBytesNullableFilter", {})
], NestedBytesNullableFilter);
