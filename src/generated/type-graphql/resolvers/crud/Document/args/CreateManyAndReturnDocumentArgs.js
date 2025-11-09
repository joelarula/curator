"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnDocumentArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DocumentCreateManyInput_1 = require("../../../inputs/DocumentCreateManyInput");
let CreateManyAndReturnDocumentArgs = class CreateManyAndReturnDocumentArgs {
};
exports.CreateManyAndReturnDocumentArgs = CreateManyAndReturnDocumentArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [DocumentCreateManyInput_1.DocumentCreateManyInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], CreateManyAndReturnDocumentArgs.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], CreateManyAndReturnDocumentArgs.prototype, "skipDuplicates", void 0);
exports.CreateManyAndReturnDocumentArgs = CreateManyAndReturnDocumentArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], CreateManyAndReturnDocumentArgs);
