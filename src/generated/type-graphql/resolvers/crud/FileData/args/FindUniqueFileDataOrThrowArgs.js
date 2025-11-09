"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueFileDataOrThrowArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataWhereUniqueInput_1 = require("../../../inputs/FileDataWhereUniqueInput");
let FindUniqueFileDataOrThrowArgs = class FindUniqueFileDataOrThrowArgs {
};
exports.FindUniqueFileDataOrThrowArgs = FindUniqueFileDataOrThrowArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FindUniqueFileDataOrThrowArgs.prototype, "where", void 0);
exports.FindUniqueFileDataOrThrowArgs = FindUniqueFileDataOrThrowArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindUniqueFileDataOrThrowArgs);
