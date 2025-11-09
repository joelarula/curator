"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const JsonNullableFilter_1 = require("../inputs/JsonNullableFilter");
const StringFilter_1 = require("../inputs/StringFilter");
const VectorStoreWhereInput_1 = require("../inputs/VectorStoreWhereInput");
let VectorStoreWhereUniqueInput = class VectorStoreWhereUniqueInput {
};
exports.VectorStoreWhereUniqueInput = VectorStoreWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreWhereInput_1.VectorStoreWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreWhereInput_1.VectorStoreWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [VectorStoreWhereInput_1.VectorStoreWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], VectorStoreWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], VectorStoreWhereUniqueInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], VectorStoreWhereUniqueInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => JsonNullableFilter_1.JsonNullableFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", JsonNullableFilter_1.JsonNullableFilter)
], VectorStoreWhereUniqueInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], VectorStoreWhereUniqueInput.prototype, "createdAt", void 0);
exports.VectorStoreWhereUniqueInput = VectorStoreWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreWhereUniqueInput", {})
], VectorStoreWhereUniqueInput);
