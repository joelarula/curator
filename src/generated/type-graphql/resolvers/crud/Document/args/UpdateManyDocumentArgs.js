"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateManyDocumentArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentUpdateManyMutationInput_1 = require("../../../inputs/DocumentUpdateManyMutationInput");
const DocumentWhereInput_1 = require("../../../inputs/DocumentWhereInput");
let UpdateManyDocumentArgs = class UpdateManyDocumentArgs {
};
exports.UpdateManyDocumentArgs = UpdateManyDocumentArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentUpdateManyMutationInput_1.DocumentUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", DocumentUpdateManyMutationInput_1.DocumentUpdateManyMutationInput)
], UpdateManyDocumentArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentWhereInput_1.DocumentWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DocumentWhereInput_1.DocumentWhereInput)
], UpdateManyDocumentArgs.prototype, "where", void 0);
exports.UpdateManyDocumentArgs = UpdateManyDocumentArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], UpdateManyDocumentArgs);
