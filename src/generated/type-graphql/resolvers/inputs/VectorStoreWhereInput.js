"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const JsonNullableFilter_1 = require("../inputs/JsonNullableFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let VectorStoreWhereInput = class VectorStoreWhereInput {
};
exports.VectorStoreWhereInput = VectorStoreWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], VectorStoreWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], VectorStoreWhereInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], VectorStoreWhereInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => JsonNullableFilter_1.JsonNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", JsonNullableFilter_1.JsonNullableFilter)
], VectorStoreWhereInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], VectorStoreWhereInput.prototype, "createdAt", void 0);
exports.VectorStoreWhereInput = VectorStoreWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreWhereInput", {})
], VectorStoreWhereInput);
