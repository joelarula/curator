"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateDocumentArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentOrderByWithRelationInput_1 = require("../../../inputs/DocumentOrderByWithRelationInput");
const DocumentWhereInput_1 = require("../../../inputs/DocumentWhereInput");
const DocumentWhereUniqueInput_1 = require("../../../inputs/DocumentWhereUniqueInput");
let AggregateDocumentArgs = class AggregateDocumentArgs {
};
exports.AggregateDocumentArgs = AggregateDocumentArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentWhereInput_1.DocumentWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentWhereInput_1.DocumentWhereInput)
], AggregateDocumentArgs.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentOrderByWithRelationInput_1.DocumentOrderByWithRelationInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], AggregateDocumentArgs.prototype, "orderBy", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentWhereUniqueInput_1.DocumentWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentWhereUniqueInput_1.DocumentWhereUniqueInput)
], AggregateDocumentArgs.prototype, "cursor", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], AggregateDocumentArgs.prototype, "take", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], AggregateDocumentArgs.prototype, "skip", void 0);
exports.AggregateDocumentArgs = AggregateDocumentArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], AggregateDocumentArgs);
