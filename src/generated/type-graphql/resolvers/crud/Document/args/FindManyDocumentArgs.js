"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyDocumentArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentOrderByWithRelationInput_1 = require("../../../inputs/DocumentOrderByWithRelationInput");
const DocumentWhereInput_1 = require("../../../inputs/DocumentWhereInput");
const DocumentWhereUniqueInput_1 = require("../../../inputs/DocumentWhereUniqueInput");
const DocumentScalarFieldEnum_1 = require("../../../../enums/DocumentScalarFieldEnum");
let FindManyDocumentArgs = class FindManyDocumentArgs {
};
exports.FindManyDocumentArgs = FindManyDocumentArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentWhereInput_1.DocumentWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentWhereInput_1.DocumentWhereInput)
], FindManyDocumentArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentOrderByWithRelationInput_1.DocumentOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindManyDocumentArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentWhereUniqueInput_1.DocumentWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentWhereUniqueInput_1.DocumentWhereUniqueInput)
], FindManyDocumentArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindManyDocumentArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], FindManyDocumentArgs.prototype, "skip", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentScalarFieldEnum_1.DocumentScalarFieldEnum], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], FindManyDocumentArgs.prototype, "distinct", void 0);
exports.FindManyDocumentArgs = FindManyDocumentArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindManyDocumentArgs);
