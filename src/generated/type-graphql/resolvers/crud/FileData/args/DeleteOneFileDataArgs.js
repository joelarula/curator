"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneFileDataArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataWhereUniqueInput_1 = require("../../../inputs/FileDataWhereUniqueInput");
let DeleteOneFileDataArgs = class DeleteOneFileDataArgs {
};
exports.DeleteOneFileDataArgs = DeleteOneFileDataArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], DeleteOneFileDataArgs.prototype, "where", void 0);
exports.DeleteOneFileDataArgs = DeleteOneFileDataArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteOneFileDataArgs);
