"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueModelOrThrowArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelWhereUniqueInput_1 = require("../../../inputs/ModelWhereUniqueInput");
let FindUniqueModelOrThrowArgs = class FindUniqueModelOrThrowArgs {
};
exports.FindUniqueModelOrThrowArgs = FindUniqueModelOrThrowArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereUniqueInput_1.ModelWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ModelWhereUniqueInput_1.ModelWhereUniqueInput)
], FindUniqueModelOrThrowArgs.prototype, "where", void 0);
exports.FindUniqueModelOrThrowArgs = FindUniqueModelOrThrowArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindUniqueModelOrThrowArgs);
