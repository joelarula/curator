"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneDocumentArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentCreateInput_1 = require("../../../inputs/DocumentCreateInput");
let CreateOneDocumentArgs = class CreateOneDocumentArgs {
};
exports.CreateOneDocumentArgs = CreateOneDocumentArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DocumentCreateInput_1.DocumentCreateInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", DocumentCreateInput_1.DocumentCreateInput)
], CreateOneDocumentArgs.prototype, "data", void 0);
exports.CreateOneDocumentArgs = CreateOneDocumentArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateOneDocumentArgs);
